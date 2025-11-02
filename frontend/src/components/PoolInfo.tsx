import React, { useState } from 'react';
import { useDEX } from '../hooks/useDEX';
import { useWeb3 } from '../hooks/useWeb3';

interface PoolInfoProps {
  contractAddress: string;
}

interface PoolData {
  id: string;
  token0: {
    address: string;
    symbol: string;
    reserve: string;
  };
  token1: {
    address: string;
    symbol: string;
    reserve: string;
  };
  totalLiquidity: string;
  userLiquidity: string;
}

const PoolInfo: React.FC<PoolInfoProps> = ({ contractAddress }) => {
  const { isConnected } = useWeb3();
  const { getPool, getUserLiquidity, getTokenInfo } = useDEX(contractAddress);

  const [pools, setPools] = useState<PoolData[]>([]);
  const [searchToken0, setSearchToken0] = useState('');
  const [searchToken1, setSearchToken1] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadPoolInfo = async () => {
    if (!searchToken0 || !searchToken1) return;

    setIsLoading(true);
    try {
      const [poolData, token0Info, token1Info, userLiq] = await Promise.all([
        getPool(searchToken0, searchToken1),
        getTokenInfo(searchToken0),
        getTokenInfo(searchToken1),
        getUserLiquidity(searchToken0, searchToken1),
      ]);

      if (poolData && token0Info && token1Info) {
        const poolId = `${searchToken0}-${searchToken1}`;
        const newPool: PoolData = {
          id: poolId,
          token0: {
            address: searchToken0,
            symbol: token0Info.symbol,
            reserve: poolData.reserve0,
          },
          token1: {
            address: searchToken1,
            symbol: token1Info.symbol,
            reserve: poolData.reserve1,
          },
          totalLiquidity: poolData.totalLiquidity,
          userLiquidity: userLiq || '0',
        };

        setPools(prev => {
          const filtered = prev.filter(p => p.id !== poolId);
          return [...filtered, newPool];
        });
      }
    } catch (error) {
      console.error('Error loading pool info:', error);
    }
    setIsLoading(false);
  };

  const handleSearch = () => {
    loadPoolInfo();
  };

  const formatNumber = (value: string, decimals: number = 4) => {
    const num = parseFloat(value);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    return num.toFixed(decimals);
  };

  const calculatePoolShare = (
    userLiquidity: string,
    totalLiquidity: string
  ) => {
    const user = parseFloat(userLiquidity);
    const total = parseFloat(totalLiquidity);
    if (total === 0 || user === 0) return '0';
    return ((user / total) * 100).toFixed(2);
  };

  return (
    <div className="pool-info">
      <h2>Pool Information</h2>

      <div className="pool-search">
        <div className="search-inputs">
          <input
            type="text"
            placeholder="Token 0 Address"
            value={searchToken0}
            onChange={e => setSearchToken0(e.target.value)}
          />
          <input
            type="text"
            placeholder="Token 1 Address"
            value={searchToken1}
            onChange={e => setSearchToken1(e.target.value)}
          />
          <button
            onClick={handleSearch}
            disabled={isLoading || !searchToken0 || !searchToken1}
          >
            {isLoading ? 'Loading...' : 'Search Pool'}
          </button>
        </div>
      </div>

      {!isConnected && (
        <div className="connect-message">
          <p>Connect your wallet to view your liquidity positions.</p>
        </div>
      )}

      {pools.length === 0 ? (
        <div className="no-pools">
          <p>
            No pools found. Search for a token pair to view pool information.
          </p>
        </div>
      ) : (
        <div className="pools-list">
          {pools.map(pool => (
            <div key={pool.id} className="pool-card">
              <div className="pool-header">
                <h3>
                  {pool.token0.symbol} / {pool.token1.symbol}
                </h3>
                <div className="pool-addresses">
                  <span className="address">
                    {pool.token0.address.substring(0, 10)}...
                  </span>
                  <span className="separator">/</span>
                  <span className="address">
                    {pool.token1.address.substring(0, 10)}...
                  </span>
                </div>
              </div>

              <div className="pool-stats">
                <div className="stat-group">
                  <h4>Pool Reserves</h4>
                  <div className="reserves">
                    <div className="reserve-item">
                      <span className="label">{pool.token0.symbol}:</span>
                      <span className="value">
                        {formatNumber(pool.token0.reserve)}
                      </span>
                    </div>
                    <div className="reserve-item">
                      <span className="label">{pool.token1.symbol}:</span>
                      <span className="value">
                        {formatNumber(pool.token1.reserve)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="stat-group">
                  <h4>Total Liquidity</h4>
                  <div className="total-liquidity">
                    <span className="value">
                      {formatNumber(pool.totalLiquidity)} LP
                    </span>
                  </div>
                </div>

                {isConnected && (
                  <div className="stat-group">
                    <h4>Your Position</h4>
                    <div className="user-position">
                      <div className="position-item">
                        <span className="label">Your Liquidity:</span>
                        <span className="value">
                          {formatNumber(pool.userLiquidity)} LP
                        </span>
                      </div>
                      <div className="position-item">
                        <span className="label">Pool Share:</span>
                        <span className="value">
                          {calculatePoolShare(
                            pool.userLiquidity,
                            pool.totalLiquidity
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {parseFloat(pool.token0.reserve) > 0 &&
                parseFloat(pool.token1.reserve) > 0 && (
                  <div className="price-info">
                    <h4>Current Prices</h4>
                    <div className="prices">
                      <div className="price-item">
                        <span>1 {pool.token0.symbol} = </span>
                        <span>
                          {formatNumber(
                            (
                              parseFloat(pool.token1.reserve) /
                              parseFloat(pool.token0.reserve)
                            ).toString(),
                            6
                          )}{' '}
                          {pool.token1.symbol}
                        </span>
                      </div>
                      <div className="price-item">
                        <span>1 {pool.token1.symbol} = </span>
                        <span>
                          {formatNumber(
                            (
                              parseFloat(pool.token0.reserve) /
                              parseFloat(pool.token1.reserve)
                            ).toString(),
                            6
                          )}{' '}
                          {pool.token0.symbol}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PoolInfo;
