import React, { useState, useCallback } from 'react';
import { SUPPORTED_CHAINS, getChainConfig, formatChainIdToHex, getGasSavings } from '../config/chains';
import toast from 'react-hot-toast';
import './ChainSwitcher.css';

interface ChainSwitcherProps {
  currentChainId: number;
  onChainChange?: (chainId: number) => void;
  showTestnets?: boolean;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export const ChainSwitcher: React.FC<ChainSwitcherProps> = ({
  currentChainId,
  onChainChange,
  showTestnets = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const switchChain = useCallback(async (chainId: number) => {
    if (!window.ethereum) {
      toast.error('Please install MetaMask to switch networks');
      return;
    }

    try {
      setSwitching(true);
      const chainIdHex = formatChainIdToHex(chainId);

      // Try to switch to the chain
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });

      if (onChainChange) {
        onChainChange(chainId);
      }

      const chain = getChainConfig(chainId);
      toast.success(`Switched to ${chain?.shortName || 'network'}`, {
        icon: chain?.logo,
        duration: 3000
      });

      setIsOpen(false);
    } catch (error: any) {
      // Chain not added to MetaMask
      if (error.code === 4902) {
        try {
          await addChain(chainId);
        } catch (addError: any) {
          toast.error(`Failed to add network: ${addError.message}`);
        }
      } else {
        toast.error(`Failed to switch network: ${error.message}`);
      }
    } finally {
      setSwitching(false);
    }
  }, [onChainChange]);

  const addChain = async (chainId: number) => {
    const chain = getChainConfig(chainId);

    if (!chain || !window.ethereum) {
      return;
    }

    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: formatChainIdToHex(chainId),
        chainName: chain.name,
        rpcUrls: [chain.rpcUrl],
        nativeCurrency: chain.nativeCurrency,
        blockExplorerUrls: [chain.blockExplorer]
      }]
    });

    if (onChainChange) {
      onChainChange(chainId);
    }

    toast.success(`Added and switched to ${chain.shortName}`, {
      icon: chain.logo,
      duration: 3000
    });

    setIsOpen(false);
  };

  const currentChain = getChainConfig(currentChainId);
  const chains = Object.values(SUPPORTED_CHAINS).filter(
    chain => showTestnets || !chain.isTestnet
  );

  return (
    <div className="chain-switcher">
      <button
        className="current-chain-button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={switching}
      >
        <span className="chain-logo">{currentChain?.logo || '⛓️'}</span>
        <span className="chain-name">{currentChain?.shortName || 'Unknown'}</span>
        <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <>
          <div className="chain-dropdown-overlay" onClick={() => setIsOpen(false)} />
          <div className="chain-dropdown">
            <div className="dropdown-header">
              <h3>Select Network</h3>
              <button
                className="close-dropdown"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="chain-list">
              {chains.map(chain => {
                const isActive = chain.chainId === currentChainId;
                const savings = getGasSavings(chain.chainId);

                return (
                  <button
                    key={chain.chainId}
                    className={`chain-option ${isActive ? 'active' : ''} ${chain.isTestnet ? 'testnet' : ''}`}
                    onClick={() => !isActive && switchChain(chain.chainId)}
                    disabled={switching || isActive}
                  >
                    <div className="chain-option-header">
                      <span className="chain-option-logo">{chain.logo}</span>
                      <div className="chain-option-info">
                        <span className="chain-option-name">{chain.shortName}</span>
                        {chain.layer === 2 && (
                          <span className="layer-badge">L2</span>
                        )}
                        {chain.isTestnet && (
                          <span className="testnet-badge">Testnet</span>
                        )}
                      </div>
                      {isActive && (
                        <span className="active-indicator">✓</span>
                      )}
                    </div>

                    {chain.gasOptimization > 0 && (
                      <div className="chain-stats">
                        <div className="stat">
                          <span className="stat-label">Gas Savings:</span>
                          <span className="stat-value savings">
                            {savings.savingsPercentage}%
                          </span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Avg Cost:</span>
                          <span className="stat-value">{savings.averageCost}</span>
                        </div>
                        <div className="stat">
                          <span className="stat-label">Speed:</span>
                          <span className="stat-value">{savings.estimatedTime}</span>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="dropdown-footer">
              <p className="network-notice">
                <span className="notice-icon">ℹ️</span>
                {showTestnets
                  ? 'Testnet mode: Use test ETH/MATIC only'
                  : 'Mainnet mode: Real transactions only'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
