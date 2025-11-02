/**
 * Liquidity Position Manager
 * Concentrated liquidity position management with IL tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

// ============================================================================
// Types
// ============================================================================

interface Position {
  id: number;
  owner: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
  depositTimestamp: number;
  feesEarned0: string;
  feesEarned1: string;
  currentValue: string;
  impermanentLoss: number;
  apr: number;
}

interface Token {
  address: string;
  symbol: string;
  decimals: number;
  price: number;
}

interface PriceRange {
  min: number;
  max: number;
  current: number;
}

interface LiquidityPositionProps {
  poolAddress: string;
  token0: Token;
  token1: Token;
  provider: ethers.BrowserProvider;
  userAddress: string;
}

// ============================================================================
// Component
// ============================================================================

export const LiquidityPosition: React.FC<LiquidityPositionProps> = ({
  poolAddress,
  token0,
  token1,
  provider,
  userAddress
}) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddLiquidity, setShowAddLiquidity] = useState(false);

  // Add liquidity form state
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [priceRange, setPriceRange] = useState<PriceRange>({
    min: 0,
    max: 0,
    current: 0
  });
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // IL Protection
  const [ilProtectionEnabled, setILProtectionEnabled] = useState(false);
  const [protectionPercentage, setProtectionPercentage] = useState(50);
  const [protectionDuration, setProtectionDuration] = useState(30);

  // ============================================================================
  // Load User Positions
  // ============================================================================

  const loadPositions = useCallback(async () => {
    if (!provider || !userAddress) return;

    setLoading(true);
    try {
      const poolContract = new ethers.Contract(
        poolAddress,
        [
          'function getUserPositions(address) view returns (uint256[])',
          'function getPosition(uint256) view returns (tuple(uint128 liquidity, int24 tickLower, int24 tickUpper, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1, uint256 depositedToken0, uint256 depositedToken1, uint256 depositTimestamp, address owner))',
          'function calculateImpermanentLoss(uint256) view returns (uint256)',
          'function collectFees(uint256) returns (uint128, uint128)'
        ],
        provider
      );

      const positionIds = await poolContract.getUserPositions(userAddress);

      const loadedPositions: Position[] = [];

      for (const id of positionIds) {
        const position = await poolContract.getPosition(id);
        const il = await poolContract.calculateImpermanentLoss(id);

        // Calculate current value
        const currentValue = ethers.formatUnits(
          BigInt(position.depositedToken0) + BigInt(position.depositedToken1),
          18
        );

        // Calculate APR (simplified)
        const feesEarned = BigInt(position.tokensOwed0) + BigInt(position.tokensOwed1);
        const depositValue = BigInt(position.depositedToken0) + BigInt(position.depositedToken1);
        const timeElapsed = (Date.now() / 1000) - Number(position.depositTimestamp);
        const apr = depositValue > 0
          ? Number(feesEarned * BigInt(31536000) / depositValue / BigInt(Math.max(timeElapsed, 1)))
          : 0;

        loadedPositions.push({
          id: Number(id),
          owner: position.owner,
          tickLower: position.tickLower,
          tickUpper: position.tickUpper,
          liquidity: position.liquidity.toString(),
          depositedToken0: ethers.formatUnits(position.depositedToken0, token0.decimals),
          depositedToken1: ethers.formatUnits(position.depositedToken1, token1.decimals),
          depositTimestamp: Number(position.depositTimestamp),
          feesEarned0: ethers.formatUnits(position.tokensOwed0, token0.decimals),
          feesEarned1: ethers.formatUnits(position.tokensOwed1, token1.decimals),
          currentValue,
          impermanentLoss: Number(il) / 100, // Convert from basis points
          apr: apr * 100
        });
      }

      setPositions(loadedPositions);
    } catch (error) {
      console.error('Failed to load positions:', error);
    } finally {
      setLoading(false);
    }
  }, [provider, userAddress, poolAddress, token0.decimals, token1.decimals]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  // ============================================================================
  // Add Liquidity
  // ============================================================================

  const handleAddLiquidity = async () => {
    if (!provider || !amount0 || !amount1 || !minPrice || !maxPrice) return;

    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(
        poolAddress,
        [
          'function mint(int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) returns (uint256, uint256, uint256)'
        ],
        signer
      );

      // Convert prices to ticks (simplified)
      const tickLower = priceToTick(parseFloat(minPrice));
      const tickUpper = priceToTick(parseFloat(maxPrice));

      const amount0Wei = ethers.parseUnits(amount0, token0.decimals);
      const amount1Wei = ethers.parseUnits(amount1, token1.decimals);

      // 1% slippage tolerance
      const amount0Min = (amount0Wei * BigInt(99)) / BigInt(100);
      const amount1Min = (amount1Wei * BigInt(99)) / BigInt(100);

      // Approve tokens first
      const token0Contract = new ethers.Contract(
        token0.address,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        signer
      );
      const token1Contract = new ethers.Contract(
        token1.address,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        signer
      );

      await token0Contract.approve(poolAddress, amount0Wei);
      await token1Contract.approve(poolAddress, amount1Wei);

      // Mint position
      const tx = await poolContract.mint(
        tickLower,
        tickUpper,
        amount0Wei,
        amount1Wei,
        amount0Min,
        amount1Min
      );

      await tx.wait();

      // Reset form
      setAmount0('');
      setAmount1('');
      setMinPrice('');
      setMaxPrice('');
      setShowAddLiquidity(false);

      // Reload positions
      await loadPositions();

      alert('Liquidity added successfully!');
    } catch (error: any) {
      console.error('Failed to add liquidity:', error);
      alert(`Failed to add liquidity: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // Remove Liquidity
  // ============================================================================

  const handleRemoveLiquidity = async (positionId: number, percentage: number) => {
    if (!provider) return;

    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(
        poolAddress,
        [
          'function burn(uint256 positionId, uint128 liquidityAmount) returns (uint256, uint256)'
        ],
        signer
      );

      const position = positions.find(p => p.id === positionId);
      if (!position) return;

      const liquidityToRemove = (BigInt(position.liquidity) * BigInt(percentage)) / BigInt(100);

      const tx = await poolContract.burn(positionId, liquidityToRemove);
      await tx.wait();

      await loadPositions();

      alert(`Removed ${percentage}% of liquidity successfully!`);
    } catch (error: any) {
      console.error('Failed to remove liquidity:', error);
      alert(`Failed to remove liquidity: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // Collect Fees
  // ============================================================================

  const handleCollectFees = async (positionId: number) => {
    if (!provider) return;

    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(
        poolAddress,
        [
          'function collectFees(uint256 positionId) returns (uint128, uint128)'
        ],
        signer
      );

      const tx = await poolContract.collectFees(positionId);
      await tx.wait();

      await loadPositions();

      alert('Fees collected successfully!');
    } catch (error: any) {
      console.error('Failed to collect fees:', error);
      alert(`Failed to collect fees: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // IL Protection
  // ============================================================================

  const handleActivateILProtection = async (positionId: number) => {
    if (!provider) return;

    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const poolContract = new ethers.Contract(
        poolAddress,
        [
          'function activateILProtection(uint256 positionId, uint256 protectionPercentage, uint256 durationDays) payable'
        ],
        signer
      );

      // Calculate protection cost (0.1% of position value per percentage point per month)
      const position = positions.find(p => p.id === positionId);
      if (!position) return;

      const cost = ethers.parseEther(
        (parseFloat(position.currentValue) * protectionPercentage * protectionDuration / 30000).toString()
      );

      const tx = await poolContract.activateILProtection(
        positionId,
        protectionPercentage,
        protectionDuration,
        { value: cost }
      );

      await tx.wait();

      alert('IL Protection activated!');
    } catch (error: any) {
      console.error('Failed to activate IL protection:', error);
      alert(`Failed to activate IL protection: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // Helper Functions
  // ============================================================================

  const priceToTick = (price: number): number => {
    // Simplified tick calculation
    // Real implementation: tick = floor(log_1.0001(price))
    return Math.floor(Math.log(price) / Math.log(1.0001));
  };

  const tickToPrice = (tick: number): number => {
    // Real implementation: price = 1.0001^tick
    return Math.pow(1.0001, tick);
  };

  const formatIL = (il: number): string => {
    if (il === 0) return '0%';
    return il > 0 ? `-${il.toFixed(2)}%` : `+${Math.abs(il).toFixed(2)}%`;
  };

  const getILColor = (il: number): string => {
    if (il === 0) return 'text-gray-600';
    if (il < 2) return 'text-yellow-600';
    if (il < 5) return 'text-orange-600';
    return 'text-red-600';
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="liquidity-position-manager">
      <div className="header">
        <h2>{token0.symbol}/{token1.symbol} Liquidity Positions</h2>
        <button
          onClick={() => setShowAddLiquidity(!showAddLiquidity)}
          className="btn-primary"
          disabled={loading}
        >
          {showAddLiquidity ? 'Cancel' : '+ Add Liquidity'}
        </button>
      </div>

      {/* Add Liquidity Form */}
      {showAddLiquidity && (
        <div className="add-liquidity-form">
          <h3>Add Concentrated Liquidity</h3>

          <div className="price-range-selector">
            <h4>Select Price Range</h4>
            <div className="range-inputs">
              <div className="input-group">
                <label>Min Price ({token1.symbol} per {token0.symbol})</label>
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="0.0"
                  step="0.01"
                />
              </div>
              <div className="input-group">
                <label>Max Price ({token1.symbol} per {token0.symbol})</label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="0.0"
                  step="0.01"
                />
              </div>
            </div>
            <p className="price-range-info">
              Current Price: {priceRange.current.toFixed(4)} {token1.symbol} per {token0.symbol}
            </p>
          </div>

          <div className="token-amounts">
            <div className="input-group">
              <label>{token0.symbol} Amount</label>
              <input
                type="number"
                value={amount0}
                onChange={(e) => setAmount0(e.target.value)}
                placeholder="0.0"
                step="0.000001"
              />
              <p className="token-value">≈ ${(parseFloat(amount0 || '0') * token0.price).toFixed(2)}</p>
            </div>

            <div className="input-group">
              <label>{token1.symbol} Amount</label>
              <input
                type="number"
                value={amount1}
                onChange={(e) => setAmount1(e.target.value)}
                placeholder="0.0"
                step="0.000001"
              />
              <p className="token-value">≈ ${(parseFloat(amount1 || '0') * token1.price).toFixed(2)}</p>
            </div>
          </div>

          <div className="il-protection-option">
            <label>
              <input
                type="checkbox"
                checked={ilProtectionEnabled}
                onChange={(e) => setILProtectionEnabled(e.target.checked)}
              />
              Enable Impermanent Loss Protection
            </label>

            {ilProtectionEnabled && (
              <div className="protection-settings">
                <div className="input-group">
                  <label>Protection Coverage: {protectionPercentage}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={protectionPercentage}
                    onChange={(e) => setProtectionPercentage(parseInt(e.target.value))}
                  />
                </div>
                <div className="input-group">
                  <label>Duration: {protectionDuration} days</label>
                  <select
                    value={protectionDuration}
                    onChange={(e) => setProtectionDuration(parseInt(e.target.value))}
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="180">180 days</option>
                    <option value="365">365 days</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleAddLiquidity}
            className="btn-primary btn-large"
            disabled={loading || !amount0 || !amount1 || !minPrice || !maxPrice}
          >
            {loading ? 'Adding...' : 'Add Liquidity'}
          </button>
        </div>
      )}

      {/* Positions List */}
      <div className="positions-list">
        {loading && positions.length === 0 ? (
          <p>Loading positions...</p>
        ) : positions.length === 0 ? (
          <p className="no-positions">No liquidity positions yet. Add liquidity to get started!</p>
        ) : (
          positions.map((position) => (
            <div key={position.id} className="position-card">
              <div className="position-header">
                <h3>Position #{position.id}</h3>
                <span className="position-apr">APR: {position.apr.toFixed(2)}%</span>
              </div>

              <div className="position-details">
                <div className="detail-row">
                  <span>Price Range:</span>
                  <span>
                    {tickToPrice(position.tickLower).toFixed(4)} - {tickToPrice(position.tickUpper).toFixed(4)}
                  </span>
                </div>

                <div className="detail-row">
                  <span>{token0.symbol} Deposited:</span>
                  <span>{parseFloat(position.depositedToken0).toFixed(6)}</span>
                </div>

                <div className="detail-row">
                  <span>{token1.symbol} Deposited:</span>
                  <span>{parseFloat(position.depositedToken1).toFixed(6)}</span>
                </div>

                <div className="detail-row">
                  <span>Fees Earned ({token0.symbol}):</span>
                  <span className="fees-earned">{parseFloat(position.feesEarned0).toFixed(6)}</span>
                </div>

                <div className="detail-row">
                  <span>Fees Earned ({token1.symbol}):</span>
                  <span className="fees-earned">{parseFloat(position.feesEarned1).toFixed(6)}</span>
                </div>

                <div className="detail-row">
                  <span>Impermanent Loss:</span>
                  <span className={getILColor(position.impermanentLoss)}>
                    {formatIL(position.impermanentLoss)}
                  </span>
                </div>

                <div className="detail-row">
                  <span>Current Value:</span>
                  <span>${parseFloat(position.currentValue).toFixed(2)}</span>
                </div>
              </div>

              <div className="position-actions">
                <button
                  onClick={() => handleCollectFees(position.id)}
                  className="btn-secondary"
                  disabled={loading || (parseFloat(position.feesEarned0) === 0 && parseFloat(position.feesEarned1) === 0)}
                >
                  Collect Fees
                </button>

                <button
                  onClick={() => handleRemoveLiquidity(position.id, 50)}
                  className="btn-secondary"
                  disabled={loading}
                >
                  Remove 50%
                </button>

                <button
                  onClick={() => handleRemoveLiquidity(position.id, 100)}
                  className="btn-danger"
                  disabled={loading}
                >
                  Remove All
                </button>

                {position.impermanentLoss > 2 && (
                  <button
                    onClick={() => handleActivateILProtection(position.id)}
                    className="btn-warning"
                    disabled={loading}
                  >
                    Activate IL Protection
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .liquidity-position-manager {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }

        .header h2 {
          font-size: 24px;
          font-weight: 600;
        }

        .add-liquidity-form {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 30px;
        }

        .add-liquidity-form h3 {
          margin-bottom: 20px;
          font-size: 20px;
        }

        .price-range-selector {
          margin-bottom: 24px;
        }

        .range-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 12px;
        }

        .price-range-info {
          color: #666;
          font-size: 14px;
        }

        .token-amounts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }

        .input-group {
          margin-bottom: 16px;
        }

        .input-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
        }

        .input-group input,
        .input-group select {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          font-size: 16px;
        }

        .token-value {
          margin-top: 4px;
          color: #666;
          font-size: 14px;
        }

        .il-protection-option {
          background: #fff;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 24px;
        }

        .protection-settings {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #eee;
        }

        .positions-list {
          display: grid;
          gap: 20px;
        }

        .position-card {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          padding: 24px;
        }

        .position-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #eee;
        }

        .position-apr {
          background: #e8f5e9;
          color: #2e7d32;
          padding: 6px 12px;
          border-radius: 6px;
          font-weight: 600;
        }

        .position-details {
          margin-bottom: 20px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
        }

        .fees-earned {
          color: #2e7d32;
          font-weight: 600;
        }

        .position-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .btn-primary,
        .btn-secondary,
        .btn-danger,
        .btn-warning {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #1976d2;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1565c0;
        }

        .btn-secondary {
          background: #f5f5f5;
          color: #333;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .btn-danger {
          background: #d32f2f;
          color: white;
        }

        .btn-danger:hover:not(:disabled) {
          background: #c62828;
        }

        .btn-warning {
          background: #ffa726;
          color: white;
        }

        .btn-warning:hover:not(:disabled) {
          background: #fb8c00;
        }

        .btn-large {
          width: 100%;
          padding: 14px;
          font-size: 16px;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .no-positions {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }

        @media (max-width: 768px) {
          .range-inputs,
          .token-amounts {
            grid-template-columns: 1fr;
          }

          .position-actions {
            flex-direction: column;
          }

          .position-actions button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default LiquidityPosition;
