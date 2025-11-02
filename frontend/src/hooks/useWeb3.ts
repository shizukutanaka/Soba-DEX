import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

interface Web3State {
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  account: string | null;
  chainId: number | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useWeb3 = () => {
  const [state, setState] = useState<Web3State>({
    provider: null,
    signer: null,
    account: null,
    chainId: null,
    isConnected: false,
    isLoading: false,
    error: null,
  });

  const connectWallet = useCallback(async () => {
    const ethereum = window.ethereum;
    if (!ethereum) {
      setState(prev => ({ ...prev, error: 'MetaMask not installed' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const accounts = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setState({
        provider,
        signer,
        account: accounts[0],
        chainId: Number(network.chainId),
        isConnected: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to connect wallet',
      }));
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setState({
      provider: null,
      signer: null,
      account: null,
      chainId: null,
      isConnected: false,
      isLoading: false,
      error: null,
    });
  }, []);

  const switchNetwork = useCallback(async (chainId: number) => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    } catch (error: any) {
      if (error.code === 4902) {
        setState(prev => ({ ...prev, error: 'Network not added to wallet' }));
      } else {
        setState(prev => ({ ...prev, error: error.message }));
      }
    }
  }, []);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          setState(prev => ({ ...prev, account: accounts[0] || null }));
        }
      };

      const handleChainChanged = (chainId: string) => {
        setState(prev => ({ ...prev, chainId: parseInt(chainId, 16) }));
      };

      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);

      return () => {
        ethereum.removeListener(
          'accountsChanged',
          handleAccountsChanged
        );
        ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
    return () => {}; // Return empty cleanup function if window.ethereum doesn't exist
  }, [disconnectWallet]);

  useEffect(() => {
    const checkConnection = async () => {
      const ethereum = window.ethereum;
      if (ethereum) {
        try {
          const accounts = await ethereum.request({
            method: 'eth_accounts',
          });

          if (accounts.length > 0) {
            const provider = new ethers.BrowserProvider(ethereum);
            const signer = await provider.getSigner();
            const network = await provider.getNetwork();

            setState({
              provider,
              signer,
              account: accounts[0],
              chainId: Number(network.chainId),
              isConnected: true,
              isLoading: false,
              error: null,
            });
          }
        } catch (error) {
          console.error('Error checking connection:', error);
        }
      }
    };

    checkConnection();
  }, []);

  return {
    ...state,
    connectWallet,
    disconnectWallet,
    switchNetwork,
  };
};

interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isConnected?: () => boolean;
  chainId?: string;
  selectedAddress?: string | null;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
