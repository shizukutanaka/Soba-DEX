import type { FC } from 'react';
import { useWeb3 } from '../hooks/useWeb3';
import { ConnectionIndicator } from './ConnectionIndicator';

const Header: FC = () => {
  const {
    account,
    chainId,
    isConnected,
    isLoading,
    connectWallet,
    disconnectWallet,
  } = useWeb3();

  const getNetworkName = (chainId: number | null) => {
    switch (chainId) {
      case 1:
        return 'Ethereum Mainnet';
      case 137:
        return 'Polygon Mainnet';
      case 56:
        return 'BSC Mainnet';
      default:
        return 'Unknown Network';
    }
  };

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <h1>DEX/DeFi Platform</h1>
        </div>

        <div className="wallet-info">
          <ConnectionIndicator />

          {isConnected && chainId && (
            <div className="network-badge">
              <span className="network-indicator"></span>
              {getNetworkName(chainId)}
            </div>
          )}

          {isConnected && account ? (
            <div className="wallet-connected">
              <span className="address">{formatAddress(account)}</span>
              <button className="disconnect-btn" onClick={disconnectWallet}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              className="connect-btn"
              onClick={connectWallet}
              disabled={isLoading}
            >
              {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
