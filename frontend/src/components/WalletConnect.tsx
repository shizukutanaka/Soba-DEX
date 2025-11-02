import React, { useState, useEffect } from 'react';

interface WalletConnectProps {
  onWalletConnect?: (address: string, balance: string) => void;
  onWalletDisconnect?: () => void;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({
  onWalletConnect,
  onWalletDisconnect,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    const ethereum = window.ethereum;
    if (ethereum) {
      try {
        const accounts = await ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          const account = accounts[0];
          setAddress(account);
          setIsConnected(true);
          await updateBalance(account);
          onWalletConnect?.(account, balance);
        }
      } catch (error) {
        // Silent fail - connection check
      }
    }
  };

  const updateBalance = async (account: string) => {
    const ethereum = window.ethereum;
    if (!ethereum) return '0.00';

    try {
      const balanceWei = await ethereum.request({
        method: 'eth_getBalance',
        params: [account, 'latest'],
      });
      const balanceEth = parseInt(balanceWei, 16) / 1e18;
      const formattedBalance = balanceEth.toFixed(4);
      setBalance(formattedBalance);
      return formattedBalance;
    } catch (error) {
      // Silent fail - balance check
      return '0.00';
    }
  };

  const connectWallet = async () => {
    const ethereum = window.ethereum;
    if (!ethereum) {
      setError('MetaMask is not installed. Please install MetaMask to continue.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length > 0) {
        const account = accounts[0];
        setAddress(account);
        setIsConnected(true);
        const currentBalance = await updateBalance(account);
        onWalletConnect?.(account, currentBalance);
        setShowDialog(false);
      }
    } catch (error: any) {
      if (error.code === 4001) {
        setError('Connection rejected by user');
      } else {
        setError('Failed to connect wallet');
      }
      // Connection error handled in UI
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress('');
    setBalance('0.00');
    setError(null);
    onWalletDisconnect?.();
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnected) {
    return (
      <div className="wallet-connected">
        <div className="wallet-info">
          <div className="wallet-address" onClick={copyAddress} title="Click to copy">
            🔗 {formatAddress(address)}
          </div>
          <div className="wallet-balance">
            💰 {balance} ETH
          </div>
        </div>
        <button className="disconnect-btn" onClick={disconnectWallet}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      <button className="connect-btn top-bar__connect" onClick={() => setShowDialog(true)}>
        Connect Wallet
      </button>

      {showDialog && (
        <div className="modal-overlay" onClick={() => setShowDialog(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Connect Wallet</h3>
              <button className="close-btn" onClick={() => setShowDialog(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              {error && (
                <div className="error-alert">
                  ⚠️ {error}
                </div>
              )}

              <div className="wallet-options">
                <button
                  className="wallet-option"
                  onClick={connectWallet}
                  disabled={isConnecting}
                >
                  <div className="wallet-icon">🦊</div>
                  <div className="wallet-details">
                    <div className="wallet-name">MetaMask</div>
                    <div className="wallet-description">
                      Connect to your MetaMask Wallet
                    </div>
                  </div>
                  {isConnecting && <div className="loading-spinner">⏳</div>}
                </button>
              </div>

              <div className="wallet-notice">
                <small>
                  By connecting a wallet, you agree to our Terms of Service and
                  acknowledge that you have read and understand our Privacy Policy.
                </small>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Add to components.css
const styles = `
.wallet-connect {
  display: flex;
  align-items: center;
}

.connect-btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.connect-btn:hover {
  background: #0056b3;
}

.wallet-connected {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wallet-info {
  display: flex;
  flex-direction: column;
  font-size: 0.875rem;
}

.wallet-address {
  font-weight: 500;
  cursor: pointer;
  color: #007bff;
}

.wallet-address:hover {
  text-decoration: underline;
}

.wallet-balance {
  color: #6c757d;
  font-size: 0.75rem;
}

.disconnect-btn {
  background: #dc3545;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.disconnect-btn:hover {
  background: #c82333;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  max-width: 400px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-body {
  padding: 16px;
}

.error-alert {
  background: #fff5f5;
  border: 1px solid #fed7d7;
  color: #e53e3e;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 0.875rem;
}

.wallet-options {
  margin-bottom: 16px;
}

.wallet-option {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  gap: 12px;
}

.wallet-option:hover {
  border-color: #007bff;
  background: #f8f9fa;
}

.wallet-option:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wallet-icon {
  font-size: 2rem;
}

.wallet-details {
  flex: 1;
  text-align: left;
}

.wallet-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.wallet-description {
  font-size: 0.875rem;
  color: #6c757d;
}

.loading-spinner {
  font-size: 1.25rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.wallet-notice {
  font-size: 0.75rem;
  color: #6c757d;
  text-align: center;
  line-height: 1.4;
}
`;

// This would typically be in a separate CSS file
export { styles as WalletConnectStyles };