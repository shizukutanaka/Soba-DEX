import React, { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import WalletConnectProvider from '@walletconnect/web3-provider';
import CoinbaseWalletSDK from '@coinbase/wallet-sdk';
import toast from 'react-hot-toast';
import './WalletConnectEnhanced.css';

interface WalletProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  connector: () => Promise<ethers.BrowserProvider>;
}

interface WalletConnectEnhancedProps {
  onConnect?: (provider: ethers.BrowserProvider, address: string) => void;
  onDisconnect?: () => void;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

const WALLET_PROVIDERS: WalletProvider[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '🦊',
    description: 'Most popular Web3 wallet',
    connector: async () => {
      if (!window.ethereum) {
        throw new Error('MetaMask not installed. Please install MetaMask from metamask.io');
      }
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      return new ethers.BrowserProvider(window.ethereum);
    }
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: '🔗',
    description: 'Connect with mobile wallets',
    connector: async () => {
      const provider = new WalletConnectProvider({
        rpc: {
          1: process.env.REACT_APP_ETH_RPC || 'https://eth-mainnet.g.alchemy.com/v2/demo',
          42161: process.env.REACT_APP_ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
          10: process.env.REACT_APP_OPTIMISM_RPC || 'https://mainnet.optimism.io',
          137: process.env.REACT_APP_POLYGON_RPC || 'https://polygon-rpc.com'
        },
        qrcodeModalOptions: {
          mobileLinks: ['metamask', 'trust', 'rainbow']
        }
      });

      await provider.enable();
      return new ethers.BrowserProvider(provider as any);
    }
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    icon: '💙',
    description: 'Easy-to-use wallet by Coinbase',
    connector: async () => {
      const coinbaseWallet = new CoinbaseWalletSDK({
        appName: 'Soba DEX',
        appLogoUrl: '/logo.png',
        darkMode: true
      });

      const ethereum = coinbaseWallet.makeWeb3Provider(
        process.env.REACT_APP_ETH_RPC || 'https://eth-mainnet.g.alchemy.com/v2/demo',
        1
      );

      await ethereum.request({ method: 'eth_requestAccounts' });
      return new ethers.BrowserProvider(ethereum as any);
    }
  }
];

export const WalletConnectEnhanced: React.FC<WalletConnectEnhancedProps> = ({
  onConnect,
  onDisconnect
}) => {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [address, setAddress] = useState<string>('');
  const [chainId, setChainId] = useState<number>(0);
  const [balance, setBalance] = useState<string>('0.00');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const connectWallet = useCallback(async (walletProvider: WalletProvider) => {
    try {
      setConnecting(walletProvider.id);
      const web3Provider = await walletProvider.connector();

      const signer = await web3Provider.getSigner();
      const userAddress = await signer.getAddress();
      const network = await web3Provider.getNetwork();
      const userBalance = await web3Provider.getBalance(userAddress);

      setProvider(web3Provider);
      setAddress(userAddress);
      setChainId(Number(network.chainId));
      setBalance(ethers.formatEther(userBalance));

      // Store in localStorage for auto-reconnect
      localStorage.setItem('walletProvider', walletProvider.id);
      localStorage.setItem('walletAddress', userAddress);

      toast.success(`Connected to ${walletProvider.name}`, {
        icon: walletProvider.icon,
        duration: 3000
      });

      if (onConnect) {
        onConnect(web3Provider, userAddress);
      }
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      toast.error(error.message || `Failed to connect to ${walletProvider.name}`, {
        duration: 5000
      });
    } finally {
      setConnecting(null);
      setIsDropdownOpen(false);
    }
  }, [onConnect]);

  const disconnectWallet = useCallback(() => {
    setProvider(null);
    setAddress('');
    setBalance('0.00');
    setChainId(0);

    localStorage.removeItem('walletProvider');
    localStorage.removeItem('walletAddress');

    toast.info('Wallet disconnected', {
      icon: '👋',
      duration: 2000
    });

    if (onDisconnect) {
      onDisconnect();
    }
  }, [onDisconnect]);

  const updateBalance = useCallback(async () => {
    if (provider && address) {
      try {
        const newBalance = await provider.getBalance(address);
        setBalance(ethers.formatEther(newBalance));
      } catch (error) {
        console.error('Failed to update balance:', error);
      }
    }
  }, [provider, address]);

  // Auto-reconnect on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem('walletProvider');
    const savedAddress = localStorage.getItem('walletAddress');

    if (savedProvider && savedAddress) {
      const wallet = WALLET_PROVIDERS.find(w => w.id === savedProvider);
      if (wallet) {
        connectWallet(wallet);
      }
    }
  }, [connectWallet]);

  // Update balance periodically
  useEffect(() => {
    if (provider && address) {
      updateBalance();
      const interval = setInterval(updateBalance, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [provider, address, updateBalance]);

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else if (accounts[0] !== address) {
          setAddress(accounts[0]);
          updateBalance();
        }
      };

      const handleChainChanged = (chainIdHex: string) => {
        const newChainId = parseInt(chainIdHex, 16);
        setChainId(newChainId);
        updateBalance();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [address, disconnectWallet, updateBalance]);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatBalance = (bal: string) => {
    return parseFloat(bal).toFixed(4);
  };

  const getChainName = (id: number): string => {
    const chains: Record<number, string> = {
      1: 'Ethereum',
      42161: 'Arbitrum',
      10: 'Optimism',
      137: 'Polygon',
      5: 'Goerli',
      11155111: 'Sepolia'
    };
    return chains[id] || `Chain ${id}`;
  };

  if (!provider) {
    return (
      <div className="wallet-connect-enhanced">
        <button
          className="connect-button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={connecting !== null}
        >
          {connecting ? (
            <>
              <span className="spinner"></span>
              Connecting...
            </>
          ) : (
            <>
              <span className="wallet-icon">👛</span>
              Connect Wallet
            </>
          )}
        </button>

        {isDropdownOpen && (
          <div className="wallet-dropdown">
            <div className="wallet-dropdown-header">
              <h3>Choose Wallet</h3>
              <button
                className="close-button"
                onClick={() => setIsDropdownOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="wallet-providers">
              {WALLET_PROVIDERS.map(wallet => (
                <button
                  key={wallet.id}
                  onClick={() => connectWallet(wallet)}
                  disabled={connecting !== null}
                  className={`wallet-provider-button ${connecting === wallet.id ? 'connecting' : ''}`}
                >
                  <span className="provider-icon">{wallet.icon}</span>
                  <div className="provider-info">
                    <span className="provider-name">{wallet.name}</span>
                    <span className="provider-description">{wallet.description}</span>
                  </div>
                  {connecting === wallet.id && <span className="spinner-small"></span>}
                </button>
              ))}
            </div>

            <div className="wallet-footer">
              <p className="wallet-notice">
                <span className="info-icon">ℹ️</span>
                By connecting, you agree to our Terms of Service
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-connected">
      <div className="wallet-info-card">
        <div className="wallet-address">
          <span className="address-label">Address:</span>
          <span className="address-value" title={address}>
            {formatAddress(address)}
          </span>
          <button
            className="copy-button"
            onClick={() => {
              navigator.clipboard.writeText(address);
              toast.success('Address copied!', { duration: 2000 });
            }}
            aria-label="Copy address"
          >
            📋
          </button>
        </div>

        <div className="wallet-balance">
          <span className="balance-label">Balance:</span>
          <span className="balance-value">
            {formatBalance(balance)} ETH
          </span>
          <button
            className="refresh-button"
            onClick={updateBalance}
            aria-label="Refresh balance"
          >
            🔄
          </button>
        </div>

        <div className="wallet-network">
          <span className="network-label">Network:</span>
          <span className={`network-badge network-${chainId}`}>
            {getChainName(chainId)}
          </span>
        </div>

        <button
          className="disconnect-button"
          onClick={disconnectWallet}
        >
          <span className="disconnect-icon">🚪</span>
          Disconnect
        </button>
      </div>
    </div>
  );
};
